// Owner decision 2026-11-20: keep giver info on the item (like v2), not in
// separate Claim entries. Safe because v3 reads Contentful server-side only;
// the site renders the count, never names or emails.
// Applied 2026-11-20. Both were created in 002 and never held data.
module.exports = function (migration) {
  migration.deleteContentType('claim');
  migration.editContentType('item').deleteField('claimCount'); // count = claims.length
};
