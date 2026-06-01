module.exports = {
  ...require('../../.prettierrc.cjs'),
  importOrder: [
    '^@wecan/(.*)$',
    '^lit(.*)$',
    '^root/(.*)$',
    '<THIRD_PARTY_MODULES>',
    '^[./]',
    '^[../]'
  ],
}
