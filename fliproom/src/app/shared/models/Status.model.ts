export class Status {
  ID: number
  name: string
  description: string

  constructor(data: any) {
    return Object.assign(this, data);
  }

  get color(): string {
    switch (this.name) {
      case 'delivered':
        return 'success'
      case 'deleted':
        return 'error'
      default:
        return 'warning'
    }
  }
}
