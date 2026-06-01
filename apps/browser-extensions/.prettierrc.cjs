module.exports = {
  ...require('../../.prettierrc.cjs'),
  importOrder: [
    '^lit(.*)$',
    '^root/(.*)$',
    '<THIRD_PARTY_MODULES>',
    '^[./]',
    '^[../]'
  ],
}
