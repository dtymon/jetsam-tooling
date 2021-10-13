## Description

`@jetsam` is a platform designed to reduce the time and effort required to build production-ready Typescript applications. While its primary focus is on the development of microservices and APIs, the platform can assist all types of applications regardless of their size and complexity.

It consists of a collection of Typescript packages that can be included into applications to perform the heavy lifting in tasks such as:

- graceful application startup and shutdown
- application configuration loading
- application logging
- database interfaces and query building
- defining and implementing APIs including auto-generation of Swagger and OpenAPI v3 specifications
- management of the Typescript toolset and 3rd-party packages

This modular approach allows applications to include as much or as little of the platform as they require.

### `@jetsam/tooling`

This package is responsible for providing centralised management of the Typescript toolset. There can be a large number of packages and tools required for a Typescript application and managing these dependencies can be an arduous task, particularly when developing a series of closely-related applications like a collection of microservices.

Ideally, each of these applications would use the same versions of the same packages where possible. It is not uncommon for organisations to have a large number of microservices which makes this task harder.

`@jetsam/tooling` can assist with this as it defines the packages and their corresponding versions required to develop Typescript applications. This includes packages required for:

- the Typescript compilation
- unit testing
- linting
- standardised code formatting

While all packages of the `@jetsam` platform use `@jetsam/tooling` to provide this consistent toolset, it is not required to be included by applications that are built on the platform.

#### Installation

To use the toolset provided by `@jetsam/tooling`, an application should install it as a development dependency:

```json
  "devDependencies": {
    "@jetsam/tooling": "^1.0.0"
  }
```
