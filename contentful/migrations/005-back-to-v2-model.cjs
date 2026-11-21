// Owner decision 2026-11-20: keep the v2 model (isStale, wishList and category
// references) and add only `claims` (004) and `image`. Removes the fields
// 002 added that the site no longer needs. All were empty when removed.
module.exports = function (migration) {
  const item = migration.editContentType('item');
  for (const id of ['recipient', 'category', 'season', 'allowMultipleClaims']) item.deleteField(id);

  const list = migration.editContentType('wishList');
  list.name('Wish List').description('Who the wish list is for, or the name of the wish list');
  list.editField('title').name('Title');
  list.deleteField('slug'); // page URL comes from the title
  list.deleteField('sortOrder');

  migration.editContentType('category').name('Category');
};
