# Permanent Class Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép giáo viên xóa vĩnh viễn lớp mình sở hữu sau một hộp xác nhận yêu cầu nhập đúng tên lớp.

**Architecture:** Một RPC PostgreSQL `delete_class_owned` thực hiện toàn bộ dọn dữ liệu và xóa lớp trong cùng giao dịch, đồng thời giữ lại bài gốc trong Kho bài tập. Backend xác minh quyền sở hữu trước khi gọi RPC; frontend đặt thao tác trong trang chi tiết lớp và chỉ bật nút xóa khi tên nhập khớp hoàn toàn.

**Tech Stack:** PostgreSQL/Supabase RPC, Node.js/Express, React 18/Vite, Node test runner, Tailwind CSS.

## Global Constraints

- Chỉ giáo viên sở hữu lớp được xóa lớp.
- Chỉ có một hộp xác nhận; phải nhập chính xác tên lớp.
- Xóa vĩnh viễn dữ liệu thuộc lớp, không có chức năng khôi phục.
- Giữ tài khoản học sinh và bài gốc độc lập trong Kho bài tập.
- Thao tác cơ sở dữ liệu phải nguyên tử: thành công toàn bộ hoặc hoàn tác toàn bộ.
- Không cấp quyền RPC cho `PUBLIC`, `anon` hoặc `authenticated`; chỉ `service_role` được thực thi.

---

### Task 1: Giao dịch PostgreSQL xóa lớp an toàn

**Files:**
- Create: `backend/src/database/migrations/008_delete_class_transaction.sql`
- Modify: `backend/test/assignmentTransactionsMigration.test.js`

**Interfaces:**
- Consumes: bảng `classes`, `assignments`, `assignment_deliveries`, `submissions` và các khóa ngoại hiện có.
- Produces: RPC `public.delete_class_owned(p_class_id UUID, p_teacher_id UUID) RETURNS JSONB`.

- [ ] **Step 1: Viết kiểm thử migration thất bại**

Thêm URL migration và test:

```js
const classDeletionMigrationUrl = new URL(
  '../src/database/migrations/008_delete_class_transaction.sql',
  import.meta.url
);

test('class deletion transaction preserves library assignments and blocks public roles', async () => {
  const sql = await readFile(classDeletionMigrationUrl, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.delete_class_owned/);
  assert.match(sql, /SECURITY DEFINER SET search_path = pg_catalog/);
  assert.match(sql, /UPDATE public\.assignments[\s\S]*SET class_id = NULL[\s\S]*is_library IS TRUE/);
  assert.match(sql, /DELETE FROM public\.submissions/);
  assert.match(sql, /UPDATE public\.assignments[\s\S]*SET source_assignment_id = NULL/);
  assert.match(sql, /DELETE FROM public\.classes/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.delete_class_owned\(UUID, UUID\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.delete_class_owned\(UUID, UUID\) TO service_role/);
});
```

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `cd backend && npm.cmd test -- --test-name-pattern="class deletion transaction"`

Expected: FAIL vì `008_delete_class_transaction.sql` chưa tồn tại.

- [ ] **Step 3: Viết RPC tối thiểu**

Tạo migration:

```sql
CREATE OR REPLACE FUNCTION public.delete_class_owned(
  p_class_id UUID,
  p_teacher_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  target_class public.classes%ROWTYPE;
  local_assignment_ids UUID[];
BEGIN
  SELECT * INTO target_class
  FROM public.classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF target_class.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;
  IF target_class.teacher_id <> p_teacher_id THEN
    RETURN pg_catalog.jsonb_build_object('status', 'forbidden');
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(id), ARRAY[]::UUID[])
  INTO local_assignment_ids
  FROM public.assignments
  WHERE class_id = p_class_id AND is_library IS NOT TRUE;

  UPDATE public.assignments
  SET source_assignment_id = NULL
  WHERE source_assignment_id = ANY(local_assignment_ids)
    AND class_id IS DISTINCT FROM p_class_id;

  DELETE FROM public.submissions
  WHERE assignment_id = ANY(local_assignment_ids)
     OR delivery_id IN (
       SELECT id FROM public.assignment_deliveries WHERE class_id = p_class_id
     );

  UPDATE public.assignments
  SET class_id = NULL
  WHERE class_id = p_class_id AND is_library IS TRUE;

  DELETE FROM public.classes WHERE id = p_class_id;
  RETURN pg_catalog.jsonb_build_object('status', 'deleted', 'id', p_class_id);
END $$;

REVOKE ALL ON FUNCTION public.delete_class_owned(UUID, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_class_owned(UUID, UUID) TO service_role;
```

- [ ] **Step 4: Chạy test để xác nhận GREEN**

Run: `cd backend && npm.cmd test -- --test-name-pattern="class deletion transaction"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/src/database/migrations/008_delete_class_transaction.sql backend/test/assignmentTransactionsMigration.test.js
git commit -m "feat: add atomic class deletion transaction"
```

---

### Task 2: API xóa lớp có phân quyền

**Files:**
- Create: `backend/test/classDeletionService.test.js`
- Modify: `backend/src/services/classService.js`
- Modify: `backend/src/controllers/classController.js`
- Modify: `backend/src/routes/index.js`

**Interfaces:**
- Consumes: RPC `delete_class_owned(p_class_id, p_teacher_id)`.
- Produces: `classService.deleteClass(classId, teacherId)` và `DELETE /api/classes/:id`.

- [ ] **Step 1: Viết kiểm thử service thất bại**

Tạo fake Supabase theo mẫu các test service hiện có và kiểm tra ba trạng thái RPC:

```js
test('maps deletion RPC statuses to stable service outcomes', async () => {
  assert.deepEqual(parseClassDeletionResult({ status: 'deleted', id: 'c1' }), {
    success: true,
    id: 'c1',
  });
  assert.throws(
    () => parseClassDeletionResult({ status: 'not_found' }),
    /Không tìm thấy lớp/
  );
  assert.throws(
    () => parseClassDeletionResult({ status: 'forbidden' }),
    /không có quyền xóa lớp/
  );
});
```

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `cd backend && npm.cmd test -- --test-name-pattern="maps deletion RPC"`

Expected: FAIL vì `parseClassDeletionResult` chưa được export.

- [ ] **Step 3: Viết service tối thiểu**

Trong `classService.js`:

```js
export const parseClassDeletionResult = (result) => {
  if (result?.status === 'deleted') return { success: true, id: result.id };
  if (result?.status === 'not_found') throw new Error('Không tìm thấy lớp');
  if (result?.status === 'forbidden') throw new Error('Bạn không có quyền xóa lớp này');
  throw new Error('Xóa lớp thất bại');
};

export const deleteClass = async (classId, teacherId) => {
  const { data, error } = await supabase.rpc('delete_class_owned', {
    p_class_id: classId,
    p_teacher_id: teacherId,
  });
  if (error) throw new Error(`Xóa lớp thất bại: ${error.message}`);
  return parseClassDeletionResult(data);
};
```

Trong controller:

```js
export const deleteClass = async (req, res) => {
  try {
    const result = await classService.deleteClass(req.params.id, req.user.id);
    return res.json(result);
  } catch (error) {
    if (error.message === 'Không tìm thấy lớp') {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === 'Bạn không có quyền xóa lớp này') {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
};
```

Trong routes:

```js
router.delete(
  '/api/classes/:id',
  authenticate,
  requireRole('teacher'),
  classController.deleteClass
);
```

- [ ] **Step 4: Chạy test backend**

Run: `cd backend && npm.cmd test`

Expected: toàn bộ test PASS, bao gồm test mới.

- [ ] **Step 5: Commit**

```powershell
git add backend/src/services/classService.js backend/src/controllers/classController.js backend/src/routes/index.js backend/test/classDeletionService.test.js
git commit -m "feat: expose owned class deletion API"
```

---

### Task 3: Hộp xác nhận xóa trên trang chi tiết lớp

**Files:**
- Create: `frontend/src/utils/classDeletion.js`
- Create: `frontend/test/classDeletion.test.js`
- Modify: `frontend/src/pages/ClassDetail.jsx`

**Interfaces:**
- Consumes: `DELETE /api/classes/:id`.
- Produces: `canConfirmClassDeletion(typedName, className): boolean` và hộp xác nhận xóa.

- [ ] **Step 1: Viết kiểm thử quy tắc xác nhận thất bại**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canConfirmClassDeletion } from '../src/utils/classDeletion.js';

test('requires the exact class name before permanent deletion', () => {
  assert.equal(canConfirmClassDeletion('10A1', '10A1'), true);
  assert.equal(canConfirmClassDeletion('10a1', '10A1'), false);
  assert.equal(canConfirmClassDeletion(' 10A1 ', '10A1'), false);
  assert.equal(canConfirmClassDeletion('', '10A1'), false);
});
```

- [ ] **Step 2: Chạy test để xác nhận RED**

Run: `cd frontend && npm.cmd test -- --test-name-pattern="exact class name"`

Expected: FAIL vì module `classDeletion.js` chưa tồn tại.

- [ ] **Step 3: Viết helper tối thiểu**

```js
export const canConfirmClassDeletion = (typedName, className) =>
  typeof typedName === 'string'
  && typeof className === 'string'
  && className.length > 0
  && typedName === className;
```

- [ ] **Step 4: Thêm giao diện và luồng xóa**

Trong `ClassDetail.jsx`:

```jsx
const navigate = useNavigate();
const [showDeleteClass, setShowDeleteClass] = useState(false);
const [deleteName, setDeleteName] = useState('');
const [deletePending, setDeletePending] = useState(false);
const [deleteError, setDeleteError] = useState('');

const deleteClass = async () => {
  if (!canConfirmClassDeletion(deleteName, classInfo?.name) || deletePending) return;
  setDeletePending(true);
  setDeleteError('');
  try {
    await api.delete(`/api/classes/${id}`);
    navigate('/classes', { replace: true });
  } catch (error) {
    setDeleteError(error.response?.data?.message || 'Xóa lớp thất bại');
    setDeletePending(false);
  }
};
```

Đặt nút `Xóa lớp` cạnh tiêu đề, chỉ render khi `user?.role === 'teacher'`. Hộp thoại phải:

```jsx
<input
  value={deleteName}
  onChange={(event) => setDeleteName(event.target.value)}
  placeholder={classInfo.name}
  disabled={deletePending}
/>
<button
  type="button"
  onClick={deleteClass}
  disabled={!canConfirmClassDeletion(deleteName, classInfo.name) || deletePending}
>
  {deletePending ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
</button>
```

Nội dung cảnh báo phải liệt kê: học sinh trong lớp, bài đã giao, bài nộp và điểm; đồng thời ghi rõ tài khoản học sinh và bài gốc trong Kho bài tập không bị xóa.

- [ ] **Step 5: Chạy test và build frontend**

Run: `cd frontend && npm.cmd test`

Expected: toàn bộ test PASS.

Run: `cd frontend && npm.cmd run build`

Expected: Vite kết thúc với `built` và exit code 0.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/utils/classDeletion.js frontend/test/classDeletion.test.js frontend/src/pages/ClassDetail.jsx
git commit -m "feat: add permanent class deletion confirmation"
```

---

### Task 4: Xác minh và triển khai production

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: migration 008, backend API và frontend dialog.
- Produces: tính năng hoạt động trên Supabase, Render và Vercel production.

- [ ] **Step 1: Chạy bộ xác minh đầy đủ**

Run:

```powershell
Set-Location backend
npm.cmd test
Set-Location ..\frontend
npm.cmd test
npm.cmd run build
Set-Location ..
git diff --check
git status --short
```

Expected: mọi test PASS, build exit 0, không có lỗi `git diff --check`, chỉ có thay đổi dự kiến.

- [ ] **Step 2: Áp dụng migration Supabase**

Chạy toàn bộ nội dung `008_delete_class_transaction.sql` trong SQL Editor của project `sfanqrirgbxpgrhcamit`, sau đó xác minh routine tồn tại và quyền execute chỉ thuộc `service_role`.

- [ ] **Step 3: Push và tạo PR**

```powershell
git push -u origin codex/permanent-class-deletion
gh pr create --base main --head codex/permanent-class-deletion --title "Cho phép xóa lớp vĩnh viễn an toàn"
```

- [ ] **Step 4: Review, merge và theo dõi backend**

Review diff và kết quả kiểm thử, merge PR; đợi Render triển khai đúng merge commit. Kiểm tra endpoint mới không xác thực trả `401` thay vì `404`.

- [ ] **Step 5: Triển khai và kiểm tra frontend**

Triển khai thư mục `frontend` lên production Vercel, xác minh alias `https://frontend-alpha-henna-71.vercel.app` trả `200` và bundle production chứa chuỗi `Xóa vĩnh viễn`.

- [ ] **Step 6: Kiểm tra thao tác thực tế bằng lớp thử nghiệm**

Tạo một lớp thử nghiệm không chứa dữ liệu thật, xác minh:

1. Nhập sai tên không bật nút xóa.
2. Nhập đúng tên bật nút.
3. Xóa thành công quay về danh sách lớp.
4. Lớp không còn trong API.
5. Tài khoản người dùng và bài Kho bài tập không thay đổi.

- [ ] **Step 7: Báo cáo triển khai**

Gửi đường dẫn production, PR, số lượng test đã chạy và hướng dẫn giáo viên: mở lớp → `Xóa lớp` → nhập đúng tên → `Xóa vĩnh viễn`.
