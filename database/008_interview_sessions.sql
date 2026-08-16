CREATE TABLE public.interview_sessions (
    id UUID PRIMARY KEY,
    schema_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    state JSONB NOT NULL,
    schema JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_sessions_status
ON public.interview_sessions(status);

CREATE INDEX idx_interview_sessions_schema_id
ON public.interview_sessions(schema_id);
