#!/bin/bash
touch ~/.bash_profile
#sudo apt install curl 
curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash 
source ~/.nvm/nvm.sh  

nvm install 16.10.0
npm install -g @ionic/cli@6.20.1
npm install -g @angular/cli@12.2.7
npm install -g cordova-res
npm install --prefix microservices/api/
npm install --prefix microservices/stockx-api/
npm install --prefix microservices/email/
npm install --prefix microservices/pdf-generator/
npm install --prefix fliproom/
npm install --prefix mobile-consignor/
npm install --prefix cypress/

#.env has been untracked by git update-index --skip-worktree microservices/api/.env  to allow local customzation