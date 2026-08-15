export const createStudentAnalysisController = (service) => ({
  async preview(req, res, next) {
    try {
      const { classId, studentId } = req.params;
      const scope = req.body?.scope ?? { mode: 'latest', limit: 5 };
      const result = await service.preview({ teacherId: req.user.id, classId, studentId, scope });
      res.json(result);
    } catch (err) { next(err); }
  },

  async createJob(req, res, next) {
    try {
      const { classId, studentId } = req.params;
      const scope = req.body?.scope ?? { mode: 'latest', limit: 5 };
      const confirmSparseData = Boolean(req.body?.confirm_sparse_data);
      const job = await service.createJob({ teacherId: req.user.id, classId, studentId, scope, confirmSparseData });
      res.status(202).json(job);
    } catch (err) { next(err); }
  },

  async getJob(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await service.getJob({ teacherId: req.user.id, jobId });
      res.json(job);
    } catch (err) { next(err); }
  },

  async listReports(req, res, next) {
    try {
      const { classId, studentId } = req.params;
      const reports = await service.listReports({ teacherId: req.user.id, classId, studentId });
      res.json(reports);
    } catch (err) { next(err); }
  },

  async getReport(req, res, next) {
    try {
      const { jobId, reportId } = req.params;
      const report = await service.getReport({ teacherId: req.user.id, jobId, reportId });
      res.json(report);
    } catch (err) { next(err); }
  },

  async reviewReport(req, res, next) {
    try {
      const { jobId, reportId } = req.params;
      const { teacher_report, student_report, decision, instruction } = req.body;
      const review = { teacher_report, student_report, decision, instruction };
      const report = await service.reviewReport({ teacherId: req.user.id, jobId, reportId, review });
      res.json(report);
    } catch (err) { next(err); }
  },

  async retryJob(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await service.retryJob({ teacherId: req.user.id, jobId });
      res.json(job);
    } catch (err) { next(err); }
  },
});

let defaultController;

const getDefaultController = async () => {
  if (defaultController) return defaultController;
  const [
    { supabase },
    { createStudentEvidenceService },
    { createStudentAnalysisService },
  ] = await Promise.all([
    import('../services/supabaseClient.js'),
    import('../services/studentEvidenceService.js'),
    import('../services/studentAnalysisService.js'),
  ]);
  const evidenceService = createStudentEvidenceService(supabase);
  defaultController = createStudentAnalysisController(createStudentAnalysisService({ db: supabase, evidenceService }));
  return defaultController;
};

export const preview = async (req, res, next) => (await getDefaultController()).preview(req, res, next);
export const createJob = async (req, res, next) => (await getDefaultController()).createJob(req, res, next);
export const getJob = async (req, res, next) => (await getDefaultController()).getJob(req, res, next);
export const listReports = async (req, res, next) => (await getDefaultController()).listReports(req, res, next);
export const getReport = async (req, res, next) => (await getDefaultController()).getReport(req, res, next);
export const reviewReport = async (req, res, next) => (await getDefaultController()).reviewReport(req, res, next);
export const retryJob = async (req, res, next) => (await getDefaultController()).retryJob(req, res, next);
