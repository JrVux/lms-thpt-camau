import { useEffect, useState } from 'react';
import api from '../services/api';
import Modal from './Modal';
import Button from './Button';
import { Unlink, Eye, GraduationCap } from 'lucide-react';

const AssignmentDeliveryList = ({ assignment, open, onClose }) => {
  const [deliveries, setDeliveries] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get(`/api/assignment-library/${assignment.id}/deliveries`);
      setDeliveries(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tải các lớp đã giao.');
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open, assignment.id]);

  if (!open) return null;

  const detach = async (delivery) => {
    if (!window.confirm('Tách bài cho lớp này? Các cập nhật từ bài gốc sẽ không còn tự đồng bộ.')) return;
    try {
      await api.post(`/api/assignment-deliveries/${delivery.id}/detach`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tách bài.');
    }
  };

  const togglePublish = async (delivery) => {
    await api.patch(`/api/assignment-deliveries/${delivery.id}`, { is_published: !delivery.is_published });
    await load();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Các lớp đã giao"
      subtitle={`Bài: ${assignment.title}`}
      maxWidth="max-w-4xl"
    >
      {error && <div className="mb-3 rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}
      <div className="space-y-3">
        {deliveries.length === 0 && (
          <p className="rounded-xl border border-dashed border-brand-border py-10 text-center text-brand-muted">
            Bài này chưa được giao cho lớp nào.
          </p>
        )}
        {deliveries.map((delivery) => (
          <div key={delivery.id} className="rounded-2xl border border-brand-border bg-page/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light text-brand">
                  <GraduationCap className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                </span>
                <div>
                  <h3 className="font-semibold text-brand-heading">{delivery.classes?.name}</h3>
                  <p className="mt-0.5 text-sm text-brand-muted">
                    {delivery.recipient_mode === 'all' ? 'Toàn bộ lớp' : `${delivery.assignment_recipients?.length ?? 0} học sinh`}
                    {' · '}{delivery.due_date ? new Date(delivery.due_date).toLocaleString('vi-VN') : 'Không hạn nộp'}
                    {' · '}{delivery.sync_mode === 'linked' ? 'Đang đồng bộ' : 'Bản riêng'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 text-sm">
                <Button size="sm" variant="blue" icon={Link} onClick={() => togglePublish(delivery)}>
                  {delivery.is_published ? 'Thu hồi' : 'Giao ngay'}
                </Button>
                {delivery.sync_mode === 'linked' && (
                  <Button size="sm" variant="orange" icon={Unlink} onClick={() => detach(delivery)}>
                    Tách bản riêng
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default AssignmentDeliveryList;