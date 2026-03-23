import './components'
import {StatusBar} from 'root/features/shell/components/status-bar'
import 'root/features/file-manager/file-manager'
import 'root/routes/gateway/gateway-page'
import 'root/routes/remote/remote-page'
import 'root/routes/no-connection.route'
import 'root/routes/remote-storage.route'
import 'root/routes/welcome.route'

export {ChromVoidApp} from 'root/routes/app.route'

// Регистрация элементов, использующих static define()
StatusBar.define()
