-- In-app feedback (docs/ARCHITECTURE.md, API: Feedback). Stored here always;
-- mirrored to a GitHub issue only when GITHUB_TOKEN is configured, in which
-- case github_issue records the issue number.

CREATE TABLE feedback (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  github_issue integer
);

CREATE INDEX feedback_at_idx ON feedback (at);
