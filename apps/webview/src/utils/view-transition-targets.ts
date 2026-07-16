export type ViewTransitionTargetRegistration = {
  getElement: () => HTMLElement | null
  settle?: () => void | Promise<void>
}

export type ResolvedViewTransitionTarget = {
  element: HTMLElement | null
  name: string
}

type StoredRegistration = ViewTransitionTargetRegistration & {
  token: symbol
}

class ViewTransitionTargetRegistry {
  private readonly registrations = new Map<string, StoredRegistration>()

  register(name: string, registration: ViewTransitionTargetRegistration): () => void {
    const token = Symbol(name)
    this.registrations.set(name, {...registration, token})

    return () => {
      if (this.registrations.get(name)?.token === token) {
        this.registrations.delete(name)
      }
    }
  }

  resolve(names: readonly string[]): ResolvedViewTransitionTarget[] {
    return names.map((name) => ({
      name,
      element: this.registrations.get(name)?.getElement() ?? null,
    }))
  }

  async settle(names: readonly string[]): Promise<void> {
    await Promise.all(names.map((name) => this.registrations.get(name)?.settle?.()))
  }

  clear(): void {
    this.registrations.clear()
  }
}

export const viewTransitionTargets = new ViewTransitionTargetRegistry()
