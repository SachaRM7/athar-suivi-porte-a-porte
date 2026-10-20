/** Restart the whole transaction, never an individual page/write from a closed transaction. */
async function statsTransaction(db, work, options) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.runTransaction(work, options); }
    catch (error) {
      // Under contention the emulator can report this instead of ABORTED (which the SDK retries).
      // Do not retry other INVALID_ARGUMENT errors, malformed data or exhausted transactions forever.
      if (attempt >= 2 || error.code !== 3 || !/Transaction is invalid or closed/i.test(error.message)) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (2 ** attempt)));
    }
  }
}
module.exports = { statsTransaction };
