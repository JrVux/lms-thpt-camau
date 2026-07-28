import { supabase } from '../services/supabaseClient.js';
import { createAssignmentDeliveryService } from '../services/assignmentDeliveryService.js';

const service = createAssignmentDeliveryService(supabase);

const failure = (res, error) => {
  const status = /không tìm thấy/i.test(error.message) ? 404
    : /đã được giao/i.test(error.message) ? 409
      : 400;
  return res.status(status).json({ message: error.message });
};

export const deliver = async (req, res) => {
  const deliveries = req.body.deliveries;
  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    return res.status(400).json({ message: 'Vui lòng chọn ít nhất một lớp để giao bài.' });
  }
  try {
    const result = await service.deliver({
      teacherId: req.user.id,
      assignmentId: req.params.id,
      deliveries,
    });
    return res.status(201).json(result);
  } catch (error) {
    return failure(res, error);
  }
};

export const listForTemplate = async (req, res) => {
  try {
    return res.json(await service.listForTemplate({
      teacherId: req.user.id,
      assignmentId: req.params.id,
    }));
  } catch (error) {
    return failure(res, error);
  }
};

export const update = async (req, res) => {
  try {
    return res.json(await service.updateDelivery({
      teacherId: req.user.id,
      deliveryId: req.params.id,
      input: req.body,
    }));
  } catch (error) {
    return failure(res, error);
  }
};

export const detach = async (req, res) => {
  try {
    return res.json(await service.detach({
      teacherId: req.user.id,
      deliveryId: req.params.id,
    }));
  } catch (error) {
    return failure(res, error);
  }
};
