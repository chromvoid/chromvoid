# @project/passmanager

Passmanager domain package for ChromVoid.

## Import Contract

- Prefer lean subpath imports for application hot paths.
- Root imports from `@project/passmanager` remain supported for compatibility only.

Recommended subpaths:

- `@project/passmanager/core`
- `@project/passmanager/types`
- `@project/passmanager/ports`
- `@project/passmanager/i18n`
- `@project/passmanager/i18n/format`
- `@project/passmanager/notify`
- `@project/passmanager/select`
- `@project/passmanager/sorting`
- `@project/passmanager/sort-storage`
- `@project/passmanager/password-utils`
- `@project/passmanager/timer`
- `@project/passmanager/flags`
- `@project/passmanager/theme`
- `@project/passmanager/consts`
- `@project/passmanager/urls`

`@project/passmanager/core` is the intentional heavy domain entrypoint. Use subpaths when a consumer only needs i18n, constants, selection helpers, or password utilities.
