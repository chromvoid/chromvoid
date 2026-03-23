(function () {
  Array.prototype.forEach.call(document.querySelectorAll('form input[type=password]'), function (pass) {
      var form = pass.closest('form');

      // <input> and <input type=""> do not get picked up by input[type=text] selector
      // so we must select all inputs and filter it with the .type property
      var users = Array.prototype.filter.call(form.querySelectorAll('input'), function (input) {
          return input.type == 'text' || input.type == 'email';
      });

      console.log({users})
      if (users.length == 1) {
          var user = users[0];

          chrome.runtime.onMessage.addListener(function (message, sender, respond) {
              console.log('>> message', message)
          });
          chrome.runtime.sendMessage('', {
              from: 'content_script',
              action: 'fill_available'
          });
      }
  });
})();