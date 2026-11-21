// v3 model, part 2: recipients, new item fields, and private Claim entries.
module.exports = function (migration) {
  // Recipient: reuse the existing wishList type (id stays `wishList`) so the
  // five existing entries become recipients without copying anything.
  const recipient = migration.editContentType('wishList');
  recipient.name('Recipient').description('A person (or shared list) with a wish list page.');
  recipient.editField('title').name('Name');
  recipient
    .createField('slug')
    .name('Slug')
    .type('Symbol')
    .validations([{ unique: true }, { regexp: { pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' } }]);
  recipient.createField('sortOrder').name('Sort order').type('Integer');

  const item = migration.editContentType('item');
  item
    .createField('recipient')
    .name('Recipient')
    .type('Link')
    .linkType('Entry')
    .validations([{ linkContentType: ['wishList'] }]);
  item
    .createField('category')
    .name('Category')
    .type('Symbol')
    .validations([{ in: ['items', 'books', 'gift-cards'] }]);
  item
    .createField('image')
    .name('Image')
    .type('Link')
    .linkType('Asset')
    .validations([{ linkMimetypeGroup: ['image'] }]);
  item
    .createField('allowMultipleClaims')
    .name('Allow multiple claims (gift cards)')
    .type('Boolean')
    .defaultValue({ 'en-US': false });
  item
    .createField('claimCount')
    .name('Claim count')
    .type('Integer')
    .validations([{ range: { min: 0 } }])
    .defaultValue({ 'en-US': 0 });
  item
    .createField('season')
    .name('Season')
    .type('Symbol')
    .validations([{ regexp: { pattern: '^\\d{4}-\\d{2}$' } }]);
  item.moveField('recipient').afterField('title');
  item.moveField('category').afterField('recipient');
  item.moveField('season').afterField('category');
  item.moveField('image').afterField('url');

  // Claim: NEVER publish these. Unpublished entries are invisible to the
  // Delivery API, which keeps giver names and emails private.
  const claim = migration
    .createContentType('claim')
    .name('Claim')
    .description('Private record of who claimed an item. Never publish.')
    .displayField('giverName');
  claim.createField('giverName').name('Giver name').type('Symbol').validations([{ size: { max: 80 } }]);
  claim.createField('giverEmail').name('Giver email').type('Symbol').validations([{ size: { max: 200 } }]);
  claim
    .createField('item')
    .name('Item')
    .type('Link')
    .linkType('Entry')
    .required(true)
    .validations([{ linkContentType: ['item'] }]);
  claim.createField('createdAt').name('Created at').type('Date').required(true);
};
