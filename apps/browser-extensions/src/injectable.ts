import {type FillPassword, InjectingMessenger} from './messenger'

const messenger = new InjectingMessenger()

class InputFinder {
  private attributes: string[] = ['name', 'id', 'placeholder', 'type', 'autocomplete', 'title']

  findUser(form: HTMLFormElement): HTMLInputElement | null {
    return this.findInput(form, ['user', 'username', 'name', 'login', 'email', 'account'])
  }

  findPassword(form: ParentNode): HTMLInputElement | null {
    return this.findInput(form, ['password', 'pwd', 'pass', 'current-password'])
  }

  findOtp(element: ParentNode): HTMLInputElement | null {
    return this.findInput(element, ['otp', 'token', 'one-time-code', 'verification', 'code'])
  }

  findSeparateOTP(form: HTMLFormElement): Array<HTMLInputElement> | null {
    const elements = [...form.elements]
    if (
      elements.length === 6 &&
      elements.every((el) => {
        return (
          el instanceof HTMLInputElement &&
          (el.title.toLowerCase() === 'code' || el.name.toLowerCase() === 'code')
        )
      })
    ) {
      return elements as Array<HTMLInputElement>
    }
    return null
  }

  private findInput(element: ParentNode, keywords: string[]): HTMLInputElement | null {
    for (const attribute of this.attributes) {
      for (const keyword of keywords) {
        const selector = `input:not([type="hidden"])[${attribute}*="${keyword}"]`
        const res = element.querySelector(selector)
        if (res instanceof HTMLInputElement) {
          return res
        }
      }
    }

    return null
  }
}

const inputFinder = new InputFinder()

const setInputValue = (input: HTMLInputElement, value: string) => {
  input.value = value
  const props = {
    bubbles: true,
    cancelable: true,
  }

  const event = new Event('change', props)
  const event2 = new Event('input', props)
  input.dispatchEvent(event)
  input.dispatchEvent(event2)
}

const fillFormsPassword = (document: Document, data: FillPassword) => {
  const forms = document.querySelectorAll('form')
  forms.forEach((form) => {
    if (form) {
      const nameElement = inputFinder.findUser(form)
      if (nameElement instanceof HTMLInputElement) {
        setInputValue(nameElement, data.username)
      }
      const passElement = inputFinder.findPassword(form) ?? inputFinder.findPassword(document)
      if (passElement instanceof HTMLInputElement) {
        setInputValue(passElement, data.password)
      }
    }
  })
}

const isTraversableNode = (node: Node): node is Node & ParentNode => {
  return node instanceof Element || node instanceof Document || node instanceof DocumentFragment
}

const traverseDOM = (node: Node & ParentNode, check = true): HTMLInputElement | undefined => {
  if (check) {
    const res = node?.querySelector(`input:not([type="hidden"])[autocomplete*="one-time-code"]`)
    if (res instanceof HTMLInputElement) {
      return res
    }
  }

  if (node instanceof SVGAElement) {
    return undefined
  }

  if (node instanceof Element && node.shadowRoot) {
    const res = traverseDOM(node.shadowRoot, true)
    if (res) {
      return res
    }
  }

  for (const child of node.childNodes) {
    if (!isTraversableNode(child) || child instanceof SVGAElement) {
      continue
    }

    const res = traverseDOM(child, false)
    if (res) {
      return res
    }
  }
  return undefined
}

messenger.on('fill_form', (data) => {
  fillFormsPassword(document, data)
})

messenger.on('fill_otp', (data) => {
  const forms = document.querySelectorAll('form')

  forms.forEach((form) => {
    const inputs = inputFinder.findSeparateOTP(form)
    if (inputs) {
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i]
        if (input) {
          setInputValue(input, data.otp[i] ?? '')
        }
      }
    } else {
      const otpElement = inputFinder.findOtp(form)
      if (otpElement instanceof HTMLInputElement) {
        setInputValue(otpElement, data.otp)
      }
    }
  })
  if (forms.length === 0) {
    const otpElement = document.body ? traverseDOM(document.body) : undefined
    if (otpElement) {
      setInputValue(otpElement, data.otp)
    }
  }
})
