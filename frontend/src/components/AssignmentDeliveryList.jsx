import { useEffect, useState } from 'react';
import api from '../services/api';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6">
        <div className="flex justify-between"><h2 className="text-xl font-bold">Các lớp đã giao</h2><button onClick={onClose} className="text-2xl">×</button></div>
        {error && <div className="mt-3 rounded bg-red-50 p-3 text-red-700">{error}</div>}
        <div className="mt-4 space-y-3">
          {deliveries.length === 0 && <p className="text-gray-500">Bài này chưa được giao cho lớp nào.</p>}
          {deliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{delivery.classes?.name}</h3>
                  <p className="text-sm text-gray-500">
                    {delivery.recipient_mode === 'all' ? 'Toàn bộ lớp' : `${delivery.assignment_recipients?.length ?? 0} học sinh`}
                    {' · '}{delivery.due_date ? new Date(delivery.due_date).toLocaleString('vi-VN') : 'Không hạn nộp'}
                    {' · '}{delivery.sync_mode === 'linked' ? 'Đang đồng bộ' : 'Bản riêng'}
                  </p>
                </div>
                <div className="flex gap-3 text-sm">
                  <button onClick={() => togglePublish(delivery)} className="font-medium text-blue-600">{delivery.is_published ? 'Thu hồi' : 'Giao ngay'}</button>
                  {delivery.sync_mode === 'linked' && <button onClick={() => detach(delivery)} className="font-medium text-orange-600">Tách bản riêng</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AssignmentDeliveryList;
