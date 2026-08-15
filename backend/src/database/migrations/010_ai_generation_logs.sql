CREATE TABLE IF NOT EXISTS ai_generation_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose VARCHAR(40) NOT NULL DEFAULT 'assignment_draft', prompt_version VARCHAR(40) NOT NULL,
 provider VARCHAR(30), model VARCHAR(160), status VARCHAR(20) NOT NULL CHECK (status IN ('success','failed')),
 input_tokens INTEGER, output_tokens INTEGER, estimated_cost NUMERIC(12,6), latency_ms INTEGER NOT NULL,
 request_hash VARCHAR(64) NOT NULL, error_code VARCHAR(80), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_teacher_time ON ai_generation_logs(teacher_id, created_at DESC);
ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_generation_logs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_generation_logs TO service_role;
