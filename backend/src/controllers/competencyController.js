import { supabase } from '../services/supabaseClient.js';
import { createCompetencyService } from '../services/competencyService.js';

export const createCompetencyController = (service) => {
  const handle = (fn) => async (req, res, next) => {
    try {
      return res.json(await fn(req));
    } catch (error) {
      return next(error);
    }
  };
  return {
    listFramework: handle((req) => service.listFramework({
      teacherId: req.user.id,
      grade: req.query.grade ?? '10',
      subject: req.query.subject ?? 'python',
    })),
    createCustomCompetency: handle((req) => service.createCustomCompetency({
      teacherId: req.user.id,
      input: req.body,
    })),
    updateCustomCompetency: handle((req) => service.updateCustomCompetency({
      teacherId: req.user.id,
      competencyId: req.params.competencyId,
      input: req.body,
    })),
    getAssignmentMappings: handle((req) => service.getAssignmentMappings({
      teacherId: req.user.id,
      assignmentId: req.params.assignmentId,
    })),
    replaceAssignmentMappings: handle((req) => service.replaceAssignmentMappings({
      teacherId: req.user.id,
      assignmentId: req.params.assignmentId,
      mappings: req.body.mappings,
    })),
    calculateClassSnapshots: handle((req) => service.calculateClassSnapshots({
      teacherId: req.user.id,
      classId: req.params.id,
    })),
    getClassDashboard: handle((req) => service.getClassDashboard({
      teacherId: req.user.id,
      classId: req.params.id,
    })),
    getStudentProfile: handle((req) => service.getStudentProfile({
      teacherId: req.user.id,
      classId: req.params.id,
      studentId: req.params.studentId,
    })),
  };
};

const controller = createCompetencyController(createCompetencyService(supabase));

export const listFramework = controller.listFramework;
export const createCustomCompetency = controller.createCustomCompetency;
export const updateCustomCompetency = controller.updateCustomCompetency;
export const getAssignmentMappings = controller.getAssignmentMappings;
export const replaceAssignmentMappings = controller.replaceAssignmentMappings;
export const calculateClassSnapshots = controller.calculateClassSnapshots;
export const getClassDashboard = controller.getClassDashboard;
export const getStudentProfile = controller.getStudentProfile;
