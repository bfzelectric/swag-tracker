# Start on another machine

1. In **GitHub Desktop**, clone `bfzelectric/swag-tracker`.
2. Open the cloned folder as a local project in **Codex**, signed in to your account.
3. Send this message:

> Set up this project on this machine. Follow SETUP_FOR_CODEX.md, do everything you
> can automatically, and give me numbered instructions only for anything that needs
> my sign-in, approval, or access. Do not create a new database or deploy changes.

You do not need the old conversation or to copy configuration files from the old
computer. Codex has the project instructions and can retrieve local configuration
from the existing Vercel project once you authorize access.

Codex and GitHub Desktop must be installed and signed in. Cloning does not execute
scripts, install software or sign in to services. Ordinary ChatGPT without access to
the local folder/terminal cannot perform machine setup; use Codex's local project mode.

The automation installs project dependencies, prepares a local configuration file
without overwriting existing settings, checks it without printing secrets, and guides
the agent through verification. Only your authentication/OS permission/access steps
should remain for you. The local app can run in preview mode if live access is pending.
