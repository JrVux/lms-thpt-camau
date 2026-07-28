import { supabase } from '../services/supabaseClient.js';
import { createStudentAssignmentService } from '../services/studentAssignmentService.js';

const service = createStudentAssignmentService(supabase);

const handle = (res, error) => {
  const status = /không được chỉ định|không tìm thấy/i.test(error.message) ? 403 : 400;
  return res.status(status).json({ message: error.message });
};

export const listMine = async (req, res) => {
  try {
    return res.json(await service.listMine({ userId: req.user.id, status: req.query.status }));
  } catch (error) {
    return handle(res, error);
  }
};

export const getDelivery = async (req, res) => {
  try {
    return res.json(await service.getDelivery({
      userId: req.user.id,
      deliveryId: req.params.id,
    }));
  } catch (error) {
    return handle(res, error);
  }
};

export const submit = async (req, res) => {
  if (!String(req.body.code ?? '').trim() || !Array.isArray(req.body.results)) {
    return res.status(400).json({ message: 'Vui lòng cung cấp code và danh sách kết quả.' });
  }
  try {
    return res.status(201).json(await service.submit({
      userId: req.user.id,
      deliveryId: req.params.id,
      code: req.body.code,
      results: req.body.results,
    }));
  } catch (error) {
    return handle(res, error);
  }
};

export const prepareRegrade = async (req, res) => {
  try {
    return res.json(await service.prepareRegrade({
      userId: req.user.id,
      submissionId: req.params.id,
    }));
  } catch (error) {
    return handle(res, error);
  }
};

export const completeRegrade = async (req, res) => {
  if (!Array.isArray(req.body.results)) {
    return res.status(400).json({ message: 'results phải là một danh sách.' });
  }
  try {
    return res.json(await service.completeRegrade({
      userId: req.user.id,
      submissionId: req.params.id,
      results: req.body.results,
    }));
  } catch (error) {
    return handle(res, error);
  }
};
