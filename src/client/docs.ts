interface TypeRef {
  kind: string;
  name: string | null;
  ofType: TypeRef | null;
}

interface InputValue {
  name: string;
  description: string | null;
  type: TypeRef;
}

interface Field {
  name: string;
  description: string | null;
  args: InputValue[];
  type: TypeRef;
}

interface SchemaType {
  kind: 'OBJECT' | 'INPUT_OBJECT' | 'ENUM' | 'SCALAR' | 'INTERFACE' | 'UNION';
  name: string;
  description: string | null;
  fields: Field[] | null;
  inputFields: InputValue[] | null;
  enumValues: { name: string; description: string | null }[] | null;
}

const TYPE_FRAGMENT = `fragment T on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }`;
const INTROSPECTION = `
  query {
    __schema {
      types {
        kind name description
        fields { name description args { name description type { ...T } } type { ...T } }
        inputFields { name description type { ...T } }
        enumValues { name description }
      }
    }
  }
  ${TYPE_FRAGMENT}`;

const typeToString = (type: TypeRef): string => {
  if (type.kind === 'NON_NULL' && type.ofType) return `${typeToString(type.ofType)}!`;
  if (type.kind === 'LIST' && type.ofType) return `[${typeToString(type.ofType)}]`;
  return type.name ?? 'Unknown';
};

const el = (tag: string, className: string | null, ...children: (Node | string)[]): HTMLElement => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.append(...children);
  return element;
};

const operation = (field: Field): HTMLElement => {
  const args = field.args.length > 0 ? `(${field.args.map((arg) => `${arg.name}: ${typeToString(arg.type)}`).join(', ')})` : '';
  const block = el('div', 'op', el('div', 'sig', `${field.name}${args}: ${typeToString(field.type)}`));
  if (field.description) block.append(el('p', null, field.description));
  return block;
};

const memberTable = (rows: { name: string; type: string; description: string | null }[]): HTMLElement => {
  const table = el('table', null, el('tr', null, el('th', null, 'Name'), el('th', null, 'Type'), el('th', null, 'Notes')));
  for (const row of rows) {
    table.append(el('tr', null, el('td', null, el('code', null, row.name)), el('td', null, el('code', null, row.type)), el('td', null, row.description ?? '')));
  }
  return table;
};

const renderReference = (types: SchemaType[]): HTMLElement => {
  const root = el('div', null);
  const named = (name: string): SchemaType | undefined => types.find((type) => type.name === name);

  for (const [name, heading] of [
    ['Query', 'Queries (read)'],
    ['Mutation', 'Mutations (create, replace, delete)']
  ] as const) {
    const root_type = named(name);
    if (!root_type?.fields) continue;
    root.append(el('h3', null, heading), ...root_type.fields.map(operation));
  }

  const custom = types.filter((type) => !type.name.startsWith('__') && !['Query', 'Mutation'].includes(type.name) && type.kind !== 'SCALAR');
  for (const type of custom) {
    const label = type.kind === 'INPUT_OBJECT' ? 'input' : type.kind === 'ENUM' ? 'enum' : 'type';
    root.append(el('h3', null, `${label} ${type.name}`));
    if (type.description) root.append(el('p', null, type.description));
    if (type.kind === 'ENUM' && type.enumValues) {
      root.append(memberTable(type.enumValues.map((value) => ({ name: value.name, type: type.name, description: value.description }))));
    } else {
      const members = type.fields ?? type.inputFields ?? [];
      root.append(memberTable(members.map((member) => ({ name: member.name, type: typeToString(member.type), description: member.description }))));
    }
  }
  return root;
};

const loadReference = async (): Promise<void> => {
  const target = document.getElementById('reference-body');
  if (!target) return;
  try {
    const response = await fetch('/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: INTROSPECTION })
    });
    const body = (await response.json()) as { data?: { __schema: { types: SchemaType[] } } };
    if (!body.data) throw new Error('No schema returned');
    target.replaceChildren(renderReference(body.data.__schema.types));
  } catch {
    target.textContent = 'The schema could not be loaded. Reload the page or open /graphql to browse it.';
  }
};

const setupConsole = (): void => {
  const run = document.getElementById('console-run');
  const query = document.getElementById('console-query') as HTMLTextAreaElement | null;
  const vars = document.getElementById('console-vars') as HTMLTextAreaElement | null;
  const out = document.getElementById('console-out');
  if (!run || !query || !vars || !out) return;

  run.addEventListener('click', () => {
    void (async () => {
      let variables: unknown = {};
      try {
        variables = vars.value.trim() === '' ? {} : JSON.parse(vars.value);
      } catch {
        out.textContent = 'Variables must be valid JSON.';
        return;
      }
      out.textContent = 'Running…';
      try {
        const response = await fetch('/graphql', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: query.value, variables })
        });
        out.textContent = JSON.stringify(await response.json(), null, 2);
      } catch {
        out.textContent = 'Could not reach the server. Check your connection and try again.';
      }
    })();
  });
};

void loadReference();
setupConsole();
