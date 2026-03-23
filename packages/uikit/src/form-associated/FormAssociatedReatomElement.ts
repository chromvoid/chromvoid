import {ReatomLitElement} from '../reatom-lit/ReatomLitElement'

import {withFormAssociated} from './withFormAssociated'

export abstract class FormAssociatedReatomElement extends withFormAssociated(ReatomLitElement) {}
