export interface Project {
  id: string;
  name: string;
  description: string;
  scope: string[];
  created_at?: string;
  data_dir: string;
  db_exists: boolean;
  active: boolean;
}

export interface CommandResult {
  cmd: string[];
  cmd_str: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  ok: boolean;
  timed_out?: boolean;
}

export interface StepsResponse {
  steps: CommandResult[];
}

export interface Role {
  id: string;
  name: string;
  is_active: number;
}

export interface Module {
  id: string;
  name: string;
  description: string;
  is_active: number;
}

export interface EndpointRow {
  id: string;
  method: string;
  host: string;
  normalized_path: string;
  auth_required: number;
  first_seen: string;
  last_seen: string;
  hit_count: number;
  roles: string | null;
  modules: string | null;
  auto_priority: string | null;
  manual_priority: string | null;
  excluded: number | null;
  dangerous: number | null;
  logout: number | null;
  qualified: number | null;
  qualification_reason: string | null;
}

export interface Parameter {
  id: string;
  endpoint_id: string;
  name: string;
  location: string;
  param_type: string;
  semantic_type: string;
  source: string;
  volatility: string;
  sensitivity: string;
  example_values: string[];
  seen_count: number;
  appears_in_roles: string[];
  appears_in_modules: string[];
  is_reflected: number;
  reflection_count: number;
  reflection_locations: string[];
  reflection_encoding: string;
}

export interface FlowRow {
  id: string;
  method: string;
  host: string;
  path: string;
  query: string;
  status_code: number | null;
  source: string;
  captured_at: string;
  endpoint_id: string | null;
  original_flow_id: string | null;
  replay_reason: string | null;
  role_name: string;
  module_name: string;
}

export interface FlowDetail {
  id: string;
  project_id: string;
  captured_at: string;
  response_end: string | null;
  method: string;
  url: string;
  host: string;
  path: string;
  query: string;
  request_headers: Record<string, string>;
  request_cookies: Record<string, string>;
  request_body: string | null;
  request_body_encoding?: string;
  status_code: number | null;
  response_headers: Record<string, string>;
  response_body: string | null;
  response_body_encoding?: string;
  content_type: string;
  session_id: string | null;
  endpoint_id: string | null;
  role_name: string;
  module_name: string;
  tags: string[];
  source: string;
  original_flow_id: string | null;
  replay_error: string | null;
  replay_reason: string | null;
  flow_meta: Record<string, any>;
}

export interface Finding {
  id: string;
  project_id: string;
  attack_type: string;
  verdict: string;
  endpoint_id: string | null;
  status: "TRIAGING" | "CONFIRMED" | "REJECTED" | "DUPLICATE";
  duplicate_of: string | null;
  created_at: string;
  updated_at: string;
  title: string;
  notes: string;
  role_name?: string | null;
  module_name?: string | null;
}

export interface FindingGroup {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  member_count: number;
}

export interface SchedulerJob {
  job_id: string;
  endpoint_id: string | null;
  resolved_endpoint_id?: string | null;
  flow_id: string | null;
  job_type: string;
  priority: number;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  failure_reason: string | null;
  replayed_flow_id: string | null;
  verdict: string | null;
  role_name?: string | null;
  module_name?: string | null;
  meta: Record<string, any>;
}

export interface CommandArgSpec {
  name: string;
  label: string;
  flag: string | null;
  kind: "text" | "number" | "boolean" | "select" | "multi";
  required: boolean;
  help: string;
  options: string[];
  default: any;
}

export interface CommandSpec {
  id: string;
  path: string[];
  summary: string;
  args: CommandArgSpec[];
  background: boolean;
}

export interface CommandGroup {
  group: string;
  label: string;
  commands: CommandSpec[];
}
