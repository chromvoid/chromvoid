module.exports = {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 110,
  bracketSpacing: false,
  tabWidth: 2,
  semi: false,

  // Use Oxc parsers for faster parsing
  plugins: ['@prettier/plugin-oxc', '@trivago/prettier-plugin-sort-imports'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderParserPlugins: ['typescript', 'decorators-legacy'],
}
