export class Icon {
  name: string
  isBuildin: boolean
  constructor(name: string, isBuildin = false) {
    this.name = name
    this.isBuildin = isBuildin
  }
}
