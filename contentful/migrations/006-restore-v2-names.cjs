// Put the v2 field ids, names and required flags back, in v2 order,
// with the two new fields next to the ones they replace.
module.exports = function (migration) {
  const item = migration.editContentType('item');
  item.changeFieldId('legacyCategory', 'category');
  item.editField('category').name('Category').required(true);
  item.editField('wishList').name('Wish List').required(true);
  item.editField('isClaimed').name('Is claimed').required(true);
  item.editField('claimedBy').name('Claimed By');
  item.editField('isStale').name('isStale');
  item.editField('claims').name('Claims (private, never shown)');

  item.moveField('description').afterField('title');
  item.moveField('url').afterField('description');
  item.moveField('wishList').afterField('url');
  item.moveField('category').afterField('wishList');
  item.moveField('isClaimed').afterField('category');
  item.moveField('claimedBy').afterField('isClaimed');
  item.moveField('claims').afterField('claimedBy');
  item.moveField('imageUrl').afterField('claims');
  item.moveField('image').afterField('imageUrl');
  item.moveField('isStale').afterField('image');
};
