module.exports = {
  ...require('../../.prettierrc.cjs'),
  importOrder: [
    '^@statx/(.*)$',
    '^@wecan/(.*)$',
    '^lit(.*)$',
    '^root/(.*)$',
    '<THIRD_PARTY_MODULES>',
    '^[./]',
    '^[../]'
  ],
}
