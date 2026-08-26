export const createAIAssignmentController = (service) => ({
  async generateDraft(req, res) {
    try {
      const allowed = Object.fromEntries(
        ['request', 'subject', 'difficulty', 'additional_requirements']
          .filter((k) => req.body[k] !== undefined)
          .map((k) => [k, req.body[k]])
      );
      return res.json(await service.generateDraft({ teacherId: req.user.id, input: allowed }));
    } catch (e) {
      const status =
        e.code === 'AI_REQUEST_IN_PROGRESS'
          ? 409
          : e.name === 'AssignmentDraftValidationError'
          ? 422
          : e.code === 'AI_CONFIGURATION_ERROR'
          ? 503
          : 502;
      return res.status(status).json({ message: e.message, code: e.code, issues: e.issues || [] });
    }
  },
  async saveProposedCompetencies(req, res) {
    try {
      return res.json(
        await service.saveProposedCompetencies({
          teacherId: req.user.id,
          assignmentId: req.params.assignmentId,
          suggestions: req.body.suggestions || [],
        })
      );
    } catch (e) {
      return res.status(400).json({ message: e.message, code: e.code });
    }
  },
});

let defaultController;
const getDefaultController = async () => {
  if (defaultController) return defaultController;
  const [
    { supabase },
    { createAIGateway },
    { createAIAssignmentService },
    { createGeminiProvider },
    { createDeepSeekProvider },
    { createOpenRouterProvider },
  ] = await Promise.all([
    import('../services/supabaseClient.js'),
    import('../services/aiGateway.js'),
    import('../services/aiAssignmentService.js'),
    import('../ai/providers/geminiProvider.js'),
    import('../ai/providers/deepSeekProvider.js'),
    import('../ai/providers/openRouterProvider.js'),
  ]);
  const gateway = createAIGateway({
    gemini: createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL }),
    deepseek: createDeepSeekProvider({ apiKey: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL }),
    openRouter: createOpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL }),
    timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 90000,
  });
  defaultController = createAIAssignmentController(createAIAssignmentService({ db: supabase, gateway }));
  return defaultController;
};

export const generateDraft = async (req, res) => (await getDefaultController()).generateDraft(req, res);
export const saveProposedCompetencies = async (req, res) => (await getDefaultController()).saveProposedCompetencies(req, res);
