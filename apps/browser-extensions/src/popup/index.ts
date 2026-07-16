import {CredentialDetail} from './components/credential-detail'
import {CredentialRow} from './components/credential-row'
import {ExtPairingForm} from './components/pairing-form'
import {RecoveryState} from './components/recovery-state'

CredentialDetail.define()
CredentialRow.define()
ExtPairingForm.define()
RecoveryState.define()

import {AppRoot} from './app'
import {popupModel} from './popup.runtime'

AppRoot.configure(popupModel)
AppRoot.define()
