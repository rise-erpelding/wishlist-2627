// v3 model, part 1: free up names and relax the v2 fields.
// Nothing is deleted. The v2 fields stay until the new site is verified,
// then a later migration omits them, and a later one deletes them.
module.exports = function (migration) {
  const item = migration.editContentType('item');

  // `category` becomes a plain symbol in 002; keep the old references under a new id.
  item.changeFieldId('category', 'legacyCategory');
  item.editField('legacyCategory').name('Category (legacy)').required(false);

  // New items (and items split per recipient) won't set these, so they can't stay required.
  item.editField('wishList').name('Wish list (legacy)').required(false);
  item.editField('isClaimed').name('Is claimed (legacy)').required(false);
  item.editField('claimedBy').name('Claimed by (legacy, public!)');
  item.editField('isStale').name('Is stale (legacy)');

  migration.editContentType('category').name('Category (legacy)');
};
