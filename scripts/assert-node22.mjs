const major = Number(process.versions.node.split('.')[0]);

if (major !== 22) {
  throw new Error(`Athar requires Node 22 for local and Cloud Functions validation; received ${process.version}.`);
}

console.log(`Node ${process.version} is valid for Athar.`);
