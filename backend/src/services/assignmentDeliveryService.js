import { validateDeliveryTargets } from './assignmentLibraryRules.js';

const throwDbError = (error) => {
  if (error) throw new Error(error.message);
};

const getOwnedTemplate = async (db, teacherId, assignmentId) => {
  const { data, error } = await db
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('teacher_id', teacherId)
    .eq('is_library', true)
    .maybeSingle();
  throwDbError(error);
  if (!data) throw new Error('Không tìm thấy bài tập trong kho.');
  return data;
};

export const createAssignmentDeliveryService = (db) => ({
  async deliver({ teacherId, assignmentId, deliveries }) {
    const assignment = await getOwnedTemplate(db, teacherId, assignmentId);
    const classIds = [...new Set(deliveries.map((item) => item.class_id))];
    const { data: classes, error: classError } = await db
      .from('classes')
      .select('id, grade, subject, teacher_id')
      .in('id', classIds)
      .eq('teacher_id', teacherId);
    throwDbError(classError);

    const { data: enrollments, error: enrollmentError } = await db
      .from('enrollments')
      .select('class_id, user_id')
      .in('class_id', classIds);
    throwDbError(enrollmentError);

    const classesById = new Map((classes ?? []).map((item) => [item.id, item]));
    const studentsByClass = new Map(classIds.map((classId) => [classId, new Set()]));
    for (const enrollment of enrollments ?? []) {
      studentsByClass.get(enrollment.class_id)?.add(enrollment.user_id);
    }
    validateDeliveryTargets(assignment, deliveries, classesById, studentsByClass);

    const created = [];
    for (const item of deliveries) {
      const { data: delivery, error } = await db
        .from('assignment_deliveries')
        .insert([{
          library_assignment_id: assignment.id,
          assignment_id: assignment.id,
          class_id: item.class_id,
          teacher_id: teacherId,
          sync_mode: 'linked',
          recipient_mode: item.recipient_mode,
          due_date: item.due_date || null,
          is_published: Boolean(item.is_published),
          max_submissions: item.max_submissions ?? null,
        }])
        .select()
        .single();
      if (error?.code === '23505') throw new Error('Bài tập đã được giao cho lớp này.');
      throwDbError(error);

      if (item.recipient_mode === 'selected') {
        const recipients = [...new Set(item.student_ids)].map((userId) => ({
          delivery_id: delivery.id,
          user_id: userId,
        }));
        const { error: recipientError } = await db
          .from('assignment_recipients')
          .insert(recipients)
          .select();
        if (recipientError) {
          await db.from('assignment_deliveries').delete().eq('id', delivery.id);
          throw new Error(`Không thể lưu danh sách học sinh: ${recipientError.message}`);
        }
      }
      created.push(delivery);
    }
    return {
      created: created.length,
      failed: 0,
      failures: [],
      deliveries: created,
    };
  },

  async listForTemplate({ teacherId, assignmentId }) {
    await getOwnedTemplate(db, teacherId, assignmentId);
    const { data, error } = await db
      .from('assignment_deliveries')
      .select('*, classes(id,name,grade,subject), assignment_recipients(user_id)')
      .eq('library_assignment_id', assignmentId)
      .eq('teacher_id', teacherId)
      .order('created_at');
    throwDbError(error);
    return data ?? [];
  },

  async updateDelivery({ teacherId, deliveryId, input }) {
    const allowed = ['due_date', 'is_published', 'max_submissions', 'recipient_mode'];
    const payload = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)));
    payload.updated_at = new Date().toISOString();
    const { data, error } = await db
      .from('assignment_deliveries')
      .update(payload)
      .eq('id', deliveryId)
      .eq('teacher_id', teacherId)
      .select()
      .maybeSingle();
    throwDbError(error);
    if (!data) throw new Error('Không tìm thấy lần giao bài.');

    if (input.recipient_mode) {
      const { error: deleteError } = await db
        .from('assignment_recipients')
        .delete()
        .eq('delivery_id', deliveryId);
      throwDbError(deleteError);
      if (input.recipient_mode === 'selected') {
        const rows = [...new Set(input.student_ids ?? [])].map((userId) => ({
          delivery_id: deliveryId,
          user_id: userId,
        }));
        if (rows.length === 0) throw new Error('Vui lòng chọn ít nhất một học sinh.');
        const { error: insertError } = await db.from('assignment_recipients').insert(rows);
        throwDbError(insertError);
      }
    }
    return data;
  },

  async detach({ teacherId, deliveryId }) {
    const { data: delivery, error } = await db
      .from('assignment_deliveries')
      .select('*, assignments:assignment_id(*, test_cases(*))')
      .eq('id', deliveryId)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    throwDbError(error);
    if (!delivery) throw new Error('Không tìm thấy lần giao bài.');
    if (delivery.sync_mode === 'detached') return delivery;

    const source = delivery.assignments;
    const clonePayload = {
      class_id: delivery.class_id,
      teacher_id: teacherId,
      category: source.category,
      is_library: false,
      source_assignment_id: delivery.library_assignment_id,
      content_version: source.content_version,
      title: source.title,
      description: source.description,
      type: source.type,
      starter_code: source.starter_code,
      solution_code: source.solution_code,
      setup_sql: source.setup_sql,
      test_code: source.test_code,
      max_score: source.max_score,
    };
    const { data: clone, error: cloneError } = await db
      .from('assignments')
      .insert([clonePayload])
      .select()
      .single();
    throwDbError(cloneError);

    const testCases = source.test_cases ?? [];
    if (testCases.length > 0) {
      const rows = testCases.map(({ id, assignment_id, ...testCase }) => ({
        ...testCase,
        assignment_id: clone.id,
      }));
      const { error: testError } = await db.from('test_cases').insert(rows).select();
      if (testError) {
        await db.from('assignments').delete().eq('id', clone.id);
        throw new Error(`Không thể sao chép test case: ${testError.message}`);
      }
    }

    const { data: updated, error: updateError } = await db
      .from('assignment_deliveries')
      .update({
        assignment_id: clone.id,
        sync_mode: 'detached',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
      .eq('teacher_id', teacherId)
      .select()
      .single();
    if (updateError) {
      await db.from('assignments').delete().eq('id', clone.id);
      throw new Error(updateError.message);
    }
    return updated;
  },
});
