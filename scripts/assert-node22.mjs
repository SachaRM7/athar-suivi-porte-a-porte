const [major, minor, patch] = process.versions.node.split('.').map(Number);

if (major !== 22 || minor < 23 || (minor === 23 && patch < 4)) {
  throw new Error(`Athar requires Node 22.23.4 or a newer Node 22 security release; received ${process.version}.`);
}

console.log(`Node ${process.version} is valid for Athar.`);
