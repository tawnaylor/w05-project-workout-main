import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { formatError } from '../errors';
import type { Context } from './context';
import { resolvers } from './resolvers';
import { typeDefs } from './typeDefs';

export const createApolloServer = (): ApolloServer<Context> =>
  new ApolloServer<Context>({
    typeDefs,
    resolvers,
    formatError,
    introspection: true,
    includeStacktraceInErrorResponses: false,
    plugins: [ApolloServerPluginLandingPageLocalDefault({ embed: true, includeCookies: true })]
  });
