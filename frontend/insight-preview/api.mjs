async function json(path, signal) {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.detail ?? problem.title ?? `Запрос завершился с кодом ${response.status}`);
  }
  return response.json();
}

export async function connect(signal) {
  const { live } = await json('./config.json', signal);
  if (!live) {
    const { demoApi } = await import('./demo.mjs');
    return demoApi(signal);
  }
  const path = '/api/v1';
  return {
    live: true,
    companies: (signal) => json(`${path}/companies`, signal),
    initiatives: (id, signal) => json(`${path}/companies/${encodeURIComponent(id)}/initiatives`, signal),
    graph: (id, filters, signal) => {
      const query = new URLSearchParams();
      if (filters.roleCode) query.set('roleCode', filters.roleCode);
      if (filters.departmentId) query.set('departmentId', filters.departmentId);
      return json(`${path}/initiatives/${encodeURIComponent(id)}/graph?${query}`, signal);
    },
    events: (id, { personId, cursor, through }, signal) => {
      const query = new URLSearchParams();
      if (personId) query.set('personId', personId);
      if (cursor) query.set('cursor', cursor);
      query.set('through', through);
      const suffix = query.size ? `?${query}` : '';
      return json(`${path}/initiatives/${encodeURIComponent(id)}/events${suffix}`, signal);
    },
  };
}

export function matches(node, { departmentId, roleCode, decisionOnly, search }) {
  return (!departmentId || node.department?.id === departmentId)
    && (!roleCode || node.role?.code === roleCode)
    && (!decisionOnly || node.decisionMaker)
    && (!search || [node.name, node.jobTitle, node.department?.name, node.role?.label]
      .some((value) => value?.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))));
}
