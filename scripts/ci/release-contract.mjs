/** Pure release guard. Unknown or partial evidence never authorizes Hosting. */
export function releaseErrors(expected, receipt, live) {
  const errors = [];
  if (!receipt || receipt.state !== 'verified') return ['Backend publié inconnu ou incomplet.'];
  if (!expected.project || expected.project !== receipt.project || expected.project !== live.project) errors.push('Projet de publication incohérent.');
  for (const key of ['rulesSha256', 'functionsSha256', 'indexesSha256']) {
    if (!/^[a-f0-9]{64}$/.test(expected[key] ?? '') || expected[key] !== receipt[key]) errors.push(`Version backend différente : ${key}.`);
  }
  if (live.rulesSha256 !== expected.rulesSha256) errors.push('Les règles actives diffèrent du build.');
  if (JSON.stringify([...live.functions].sort()) !== JSON.stringify([...expected.productionFunctions].sort())) errors.push('Surface Functions active différente du contrat.');
  if (!live.functionsRevision || live.functionsRevision !== receipt.functionsRevision) errors.push('Functions modifiées depuis leur validation.');
  if (!live.indexesReady) errors.push('Index Firestore absents ou encore en construction.');
  return errors;
}

export async function publishRelease({ expected, includeBackend, deployBackend, inspectBackend, readReceipt, writeReceipt, deployHosting }) {
  if (includeBackend) {
    // Fail closed across services: never publish a new frontend after a partial backend deployment.
    await writeReceipt({ state: 'deploying', project: expected.project, commit: expected.commit });
    await deployBackend();
    const live = await inspectBackend();
    const receipt = { ...expected, state: 'verified', functionsRevision: live.functionsRevision, verifiedAt: new Date().toISOString() };
    const errors = releaseErrors(expected, receipt, live);
    if (errors.length) throw new Error(errors.join('\n'));
    await writeReceipt(receipt);
  }
  const errors = releaseErrors(expected, await readReceipt(), await inspectBackend());
  if (errors.length) throw new Error(errors.join('\n'));
  await deployHosting();
}

/** Firestore appends __name__ in the direction of the last ordered field. */
export function declaredIndexesReady(declared, actual) {
  const fields = index => {
    const values = index.fields.map(field => [field.fieldPath, field.order ?? null, field.arrayConfig ?? null]);
    if (!values.some(field => field[0] === '__name__')) values.push(['__name__', values.filter(field => field[1]).at(-1)?.[1] ?? 'ASCENDING', null]);
    return JSON.stringify(values);
  };
  return declared.every(index => actual.some(live =>
    live.name.split('/collectionGroups/')[1]?.split('/')[0] === index.collectionGroup &&
    live.queryScope === index.queryScope && live.state === 'READY' && fields(live) === fields(index)));
}
