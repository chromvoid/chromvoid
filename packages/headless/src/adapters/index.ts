export interface AdapterBindings<TRootProps, TItemProps> {
  rootProps: TRootProps
  getItemProps(itemId: string): TItemProps
  onKeyDown(event: KeyboardEvent): void
  onClick(event: MouseEvent): void
}

export interface HeadlessAdapter<TModel, TRootProps, TItemProps> {
  bind(model: TModel): AdapterBindings<TRootProps, TItemProps>
}
