// `claims` is a JSON list on the item, newest last:
//   [{ "id": "k3x9...", "name": "Mom", "email": "", "at": "2026-11-27T18:04:00Z" }]
// `id` lets Undo remove exactly the claim that was just made.
// The site shows only the count. Names and emails are for the owner in Contentful.
module.exports = function (migration) {
  const item = migration.editContentType('item');
  item
    .createField('claims')
    .name('Claims (private, never shown)')
    .type('Object');
  item.moveField('claims').afterField('allowMultipleClaims');
};
