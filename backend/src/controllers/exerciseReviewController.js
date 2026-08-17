import { createExerciseReviewService } from '../services/exerciseReviewService.js';

const reviewService = createExerciseReviewService();

export const listPendingExercises = async (req, res, next) => {
  try {
    const { nhanh, muc_do } = req.query;
    const data = await reviewService.listPending({ nhanh, mucDo: muc_do });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const reviewExercise = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision } = req.body;
    const data = await reviewService.reviewExercise({ id, decision, reviewerId: req.user.id });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const listDeThiPending = async (req, res, next) => {
  try {
    const data = await reviewService.getDeThiPending();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const reviewDeThi = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision } = req.body;
    const data = await reviewService.reviewDeThi({ id, decision, reviewerId: req.user.id });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};