import { ApiError, gql } from './api.js';

type WorkoutType = 'STRENGTH' | 'CARDIO' | 'MOBILITY';

interface Exercise {
  name: string;
  sets: number;
  reps: number;
}

interface Workout {
  id: string;
  name: string;
  type: WorkoutType;
  difficulty: number;
  durationMinutes: number;
  xpReward: number;
  exercises: Exercise[];
  completed: boolean;
  completedAt: string | null;
  playerId: string;
}

interface Player {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalXp: number;
  level: number;
}

const XP_PER_LEVEL = 500;
const XP_PER_PLATE = 100;
const PLATE_COLORS = ['#d4412f', '#2d6bd3', '#edb92e', '#2f8a57', '#17261f'];
const TYPE_LABEL: Record<WorkoutType, string> = { STRENGTH: 'Strength', CARDIO: 'Cardio', MOBILITY: 'Mobility' };

const WORKOUT_FIELDS = `id name type difficulty durationMinutes xpReward completed completedAt playerId exercises { name sets reps }`;

const state: { me: Player | null; workouts: Workout[]; players: Player[]; editing: Workout | null } = {
  me: null,
  workouts: [],
  players: [],
  editing: null
};

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

type Child = Node | string | null | undefined | false;

/** Builds DOM nodes with textContent only, so user-provided text is never parsed as HTML. */
const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean | ((event: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'function') element.addEventListener(key.replace(/^on/, ''), value);
    else if (typeof value === 'boolean') {
      if (value) element.setAttribute(key, '');
    } else element.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
};

const svg = (markup: string): SVGElement => {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as SVGElement;
};

let toastTimer: number | undefined;
const toast = (message: string, isError = false): void => {
  const element = $('toast');
  element.textContent = message;
  element.className = isError ? 'toast error' : 'toast';
  element.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    element.hidden = true;
  }, 4000);
};

const describeError = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.code === 'UNAUTHENTICATED') return 'Your session ended. Sign in with GitHub to continue.';
    return error.fields.length > 0 ? error.fields.map((issue) => issue.message).join('. ') : error.message;
  }
  return 'Something went wrong. Check your connection and try again.';
};

const barbell = (xpIntoLevel: number): SVGElement => {
  const plates = Math.min(5, Math.floor(xpIntoLevel / XP_PER_PLATE));
  const slots = Array.from({ length: 5 }, (_, index) => {
    const x = 20 + index * 18;
    const heights = [46, 42, 38, 34, 30];
    const height = heights[index] ?? 30;
    const y = 30 - height / 2;
    if (index < plates) {
      const fill = PLATE_COLORS[index] ?? '#17261f';
      return `<rect class="${index === plates - 1 ? 'plate-drop' : ''}" x="${x}" y="${y}" width="12" height="${height}" rx="2" fill="${fill}"/>`;
    }
    return `<rect class="slot" x="${x}" y="${y}" width="12" height="${height}" rx="2"/>`;
  }).join('');
  return svg(
    `<svg class="barbell" viewBox="0 0 320 60" role="img" aria-label="${plates} of 5 plates loaded for this level">` +
      `<rect class="bar" x="4" y="28" width="312" height="4" rx="2"/>` +
      `<rect class="sleeve" x="10" y="25" width="12" height="10" rx="2"/>` +
      `<g>${slots}</g></svg>`
  );
};

const renderPanel = (): void => {
  const panel = $('player-panel');
  panel.replaceChildren();

  const progress = h('section', {}, h('h2', {}, 'Your progress'));
  if (state.me) {
    const me = state.me;
    const xpIntoLevel = me.totalXp % XP_PER_LEVEL;
    progress.append(
      h(
        'div',
        { class: 'profile' },
        me.avatarUrl
          ? h('img', { class: 'avatar', src: me.avatarUrl, alt: '', width: '56', height: '56' })
          : h('div', { class: 'avatar', 'aria-hidden': 'true' }, me.displayName.slice(0, 1).toUpperCase()),
        h('div', {}, h('strong', {}, me.displayName), h('span', {}, `@${me.username}`))
      ),
      h(
        'p',
        { class: 'level' },
        h('span', { class: 'num' }, String(me.level)),
        h('span', { class: 'xp' }, `level, ${xpIntoLevel} of ${XP_PER_LEVEL} XP to the next one`)
      ),
      barbell(xpIntoLevel),
      h('p', {}, h('button', { class: 'btn', type: 'button', onclick: () => void signOut() }, 'Sign out'))
    );
  } else {
    progress.append(
      h('p', {}, 'Sign in to log workouts, finish them for XP, and climb the leaderboard. You can browse everything without an account.'),
      h('p', {}, h('a', { class: 'btn primary', href: '/auth/github' }, 'Sign in with GitHub'))
    );
  }

  const board = h('section', {}, h('h2', {}, 'Leaderboard'));
  if (state.players.length === 0) {
    board.append(h('p', {}, 'No players yet. Sign in to be the first.'));
  } else {
    board.append(
      h(
        'ol',
        { class: 'leaderboard' },
        ...state.players.slice(0, 10).map((player, index) =>
          h(
            'li',
            {},
            h('span', { class: 'rank' }, String(index + 1)),
            h('span', { class: state.me?.id === player.id ? 'you' : '' }, player.displayName),
            h('span', { class: 'pts' }, `Level ${player.level}, ${player.totalXp} XP`)
          )
        )
      )
    );
  }
  panel.append(progress, board);
};

const visibleWorkouts = (): Workout[] => {
  const status = $<HTMLSelectElement>('filter-status').value;
  return state.workouts.filter((workout) => (status === 'open' ? !workout.completed : status === 'done' ? workout.completed : true));
};

const renderWorkouts = (): void => {
  const list = $('workout-list');
  list.replaceChildren();
  $('new-workout').hidden = !state.me;
  const workouts = visibleWorkouts();

  if (workouts.length === 0) {
    list.append(
      h(
        'div',
        { class: 'empty' },
        h('strong', {}, 'No workouts here yet'),
        state.me ? 'Use New workout to add your first one.' : 'Sign in with GitHub to add the first one.'
      )
    );
    return;
  }

  for (const workout of workouts) {
    const mine = state.me?.id === workout.playerId;
    const actions = h('div', { class: 'actions' });
    if (mine) {
      if (!workout.completed) {
        actions.append(h('button', { class: 'btn primary small', type: 'button', onclick: () => void completeWorkout(workout) }, 'Complete'));
      }
      actions.append(
        h('button', { class: 'btn small', type: 'button', onclick: () => openForm(workout) }, 'Edit'),
        h('button', { class: 'btn danger small', type: 'button', onclick: () => void deleteWorkout(workout) }, 'Delete')
      );
    }
    list.append(
      h(
        'article',
        { class: workout.completed ? 'workout done' : 'workout', 'data-type': workout.type },
        h('div', { class: 'edge', 'aria-hidden': 'true' }),
        h(
          'div',
          {},
          h('h3', { class: 'name' }, workout.name),
          h(
            'div',
            { class: 'meta' },
            h('span', { class: 'kind' }, TYPE_LABEL[workout.type]),
            h('span', {}, `${workout.durationMinutes} min`),
            h('span', {}, `Difficulty ${workout.difficulty}/10`),
            h('span', { class: 'xp' }, `${workout.xpReward} XP`),
            workout.completedAt ? h('span', {}, `Done ${new Date(workout.completedAt).toLocaleDateString()}`) : null
          ),
          workout.exercises.length > 0
            ? h('ul', {}, ...workout.exercises.map((exercise) => h('li', {}, `${exercise.name}: ${exercise.sets} x ${exercise.reps}`)))
            : null
        ),
        actions
      )
    );
  }
};

const loadWorkouts = async (): Promise<void> => {
  const type = $<HTMLSelectElement>('filter-type').value || null;
  const data = await gql<{ workouts: Workout[] }>(
    `query ($type: WorkoutType) { workouts(type: $type) { ${WORKOUT_FIELDS} } }`,
    { type }
  );
  state.workouts = data.workouts;
  renderWorkouts();
};

const loadPlayers = async (): Promise<void> => {
  const data = await gql<{ me: Player | null; players: Player[] }>(
    `{ me { id username displayName avatarUrl totalXp level } players { id username displayName avatarUrl totalXp level } }`
  );
  state.me = data.me;
  state.players = data.players;
  renderPanel();
};

const refreshAll = async (): Promise<void> => {
  await Promise.all([loadPlayers(), loadWorkouts()]);
  renderWorkouts();
};

const signOut = async (): Promise<void> => {
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  toast('Signed out');
  await refreshAll();
};

const completeWorkout = async (workout: Workout): Promise<void> => {
  try {
    await gql(`mutation ($id: ID!) { completeWorkout(id: $id) { id } }`, { id: workout.id });
    toast(`Completed ${workout.name}: +${workout.xpReward} XP`);
    await refreshAll();
  } catch (error) {
    toast(describeError(error), true);
  }
};

const deleteWorkout = async (workout: Workout): Promise<void> => {
  if (!window.confirm(`Delete "${workout.name}"? This cannot be undone.`)) return;
  try {
    await gql(`mutation ($id: ID!) { deleteWorkout(id: $id) { id } }`, { id: workout.id });
    toast(`Deleted ${workout.name}`);
    await refreshAll();
  } catch (error) {
    toast(describeError(error), true);
  }
};

/* ---------- workout form ---------- */

const dialog = (): HTMLDialogElement => $<HTMLDialogElement>('workout-dialog');
const form = (): HTMLFormElement => $<HTMLFormElement>('workout-form');

const addExerciseRow = (exercise: Exercise = { name: '', sets: 3, reps: 10 }): void => {
  const row = h(
    'div',
    { class: 'exercise-row' },
    h('input', { name: 'exerciseName', placeholder: 'Exercise', 'aria-label': 'Exercise name', value: exercise.name, maxlength: '80' }),
    h('input', { name: 'exerciseSets', type: 'number', min: '1', max: '100', 'aria-label': 'Sets', value: String(exercise.sets) }),
    h('input', { name: 'exerciseReps', type: 'number', min: '1', max: '1000', 'aria-label': 'Reps', value: String(exercise.reps) }),
    h('button', { class: 'btn quiet small', type: 'button', onclick: () => row.remove() }, 'Remove')
  );
  $('exercise-rows').append(row);
};

const showFormErrors = (messages: string[]): void => {
  const box = $('form-errors');
  box.replaceChildren();
  box.hidden = messages.length === 0;
  if (messages.length === 0) return;
  box.append('Fix these before saving:', h('ul', {}, ...messages.map((message) => h('li', {}, message))));
};

const openForm = (workout: Workout | null): void => {
  state.editing = workout;
  const element = form();
  element.reset();
  $('exercise-rows').replaceChildren();
  showFormErrors([]);
  $('dialog-title').textContent = workout ? 'Edit workout' : 'New workout';
  (element.elements.namedItem('name') as HTMLInputElement).value = workout?.name ?? '';
  (element.elements.namedItem('type') as HTMLSelectElement).value = workout?.type ?? 'STRENGTH';
  (element.elements.namedItem('difficulty') as HTMLInputElement).value = String(workout?.difficulty ?? 5);
  (element.elements.namedItem('durationMinutes') as HTMLInputElement).value = String(workout?.durationMinutes ?? 30);
  (element.elements.namedItem('xpReward') as HTMLInputElement).value = String(workout?.xpReward ?? 100);
  for (const exercise of workout?.exercises ?? []) addExerciseRow(exercise);
  dialog().showModal();
  (element.elements.namedItem('name') as HTMLInputElement).focus();
};

const readForm = (): Record<string, unknown> => {
  const element = form();
  const value = (name: string): string => (element.elements.namedItem(name) as HTMLInputElement).value;
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.exercise-row'));
  const exercises = rows
    .map((row) => ({
      name: row.querySelector<HTMLInputElement>('[name="exerciseName"]')?.value.trim() ?? '',
      sets: Number(row.querySelector<HTMLInputElement>('[name="exerciseSets"]')?.value),
      reps: Number(row.querySelector<HTMLInputElement>('[name="exerciseReps"]')?.value)
    }))
    .filter((exercise) => exercise.name !== '');
  return {
    name: value('name'),
    type: value('type'),
    difficulty: Number(value('difficulty')),
    durationMinutes: Number(value('durationMinutes')),
    xpReward: Number(value('xpReward')),
    exercises,
    completed: state.editing?.completed ?? false
  };
};

const saveWorkout = async (event: Event): Promise<void> => {
  event.preventDefault();
  const input = readForm();
  const save = $<HTMLButtonElement>('save-workout');
  save.disabled = true;
  try {
    if (state.editing) {
      await gql(`mutation ($id: ID!, $input: WorkoutInput!) { updateWorkout(id: $id, input: $input) { id } }`, {
        id: state.editing.id,
        input
      });
      toast('Workout updated');
    } else {
      await gql(`mutation ($input: WorkoutInput!) { createWorkout(input: $input) { id } }`, { input });
      toast('Workout added');
    }
    dialog().close();
    await refreshAll();
  } catch (error) {
    if (error instanceof ApiError && error.fields.length > 0) {
      showFormErrors(error.fields.map((issue) => issue.message));
    } else {
      showFormErrors([describeError(error)]);
    }
  } finally {
    save.disabled = false;
  }
};

/* ---------- start ---------- */

const start = async (): Promise<void> => {
  $('new-workout').addEventListener('click', () => openForm(null));
  $('add-exercise').addEventListener('click', () => addExerciseRow());
  $('cancel-form').addEventListener('click', () => dialog().close());
  form().addEventListener('submit', (event) => void saveWorkout(event));
  $('filter-type').addEventListener('change', () => void loadWorkouts().catch((error) => toast(describeError(error), true)));
  $('filter-status').addEventListener('change', renderWorkouts);

  if (new URLSearchParams(window.location.search).get('signin') === 'failed') {
    toast('GitHub sign-in did not finish. Try again.', true);
  }
  try {
    await refreshAll();
  } catch (error) {
    $('workout-list').append(h('div', { class: 'empty' }, h('strong', {}, 'Cannot reach the server'), describeError(error)));
  }
};

void start();
