// Local (browser) storage for the user profile and recent projects.
// NOTE: this is a simple local profile, not secure server-side login.
const USER_KEY = "buildora_user_v1";
const PROJECTS_KEY = "buildora_projects_v1";
const MAX_PROJECTS = 12;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const makeId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const getUser = () => read(USER_KEY, null);
export const loginUser = (name, email) =>
  write(USER_KEY, { name: name.trim(), email: email.trim().toLowerCase() });
export const logoutUser = () => {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {}
};

export const listProjects = () =>
  read(PROJECTS_KEY, []).sort((a, b) => b.updated - a.updated);

export const getProject = (id) =>
  read(PROJECTS_KEY, []).find((p) => p.id === id) || null;

export function saveProject(project) {
  const all = read(PROJECTS_KEY, []).filter((p) => p.id !== project.id);
  all.unshift({ ...project, updated: Date.now() });
  let trimmed = all.slice(0, MAX_PROJECTS);
  // If storage is full, drop the oldest projects until it fits.
  while (trimmed.length && !write(PROJECTS_KEY, trimmed)) {
    trimmed = trimmed.slice(0, -1);
  }
}

export function deleteProject(id) {
  write(
    PROJECTS_KEY,
    read(PROJECTS_KEY, []).filter((p) => p.id !== id)
  );
      }
