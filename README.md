# [Backstage](https://backstage.io)

To start the app, follow below steps:

- Clone the repo:

```sh
git clone repo-link
```

- Install dependencies:

```sh
yarn install
```

- Follow below guides to setup auth & scafforder
  - [Setting up authentication](https://backstage.io/docs/getting-started/config/authentication/#setting-up-authentication)
  - [Setting up a GitHub Integration](https://backstage.io/docs/getting-started/config/authentication/#setting-up-a-github-integration)
  - Create a new file called `app-config.local.yaml`  and copy the contents from `app-config.example.yaml` file to it. Run locally;

  ```sh
    cp app-config.example.yaml app-config.local.yaml

  ```

  - Replace the below configs with us:
    - `clientId:`
    - `clientSecret:`
    - `token:`

- Install Tech-docs packages to your local machine by following [this guide](https://backstage.io/docs/features/techdocs/getting-started#:~:text=You%20will%20have%20to%20install%20the%20mkdocs%20and%20mkdocs%2Dtechdocs%2Dcore%20package%20from%20pip%2C%20optionally%20also%20graphviz%20and%20plantuml%20from%20your%20OS%20package%20manager%20(e.g.%20apt).)

- Once installed correctly, run the app:

```sh
yarn start
```
