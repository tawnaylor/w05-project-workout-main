export const typeDefs = /* GraphQL */ `
  """Category of a workout."""
  enum WorkoutType {
    STRENGTH
    CARDIO
    MOBILITY
  }

  """One exercise inside a workout."""
  type Exercise {
    name: String!
    sets: Int!
    reps: Int!
  }

  """A workout owned by a player. Completing it awards its XP to the owner."""
  type Workout {
    id: ID!
    name: String!
    type: WorkoutType!
    "Difficulty from 1 (easy) to 10 (brutal)."
    difficulty: Int!
    durationMinutes: Int!
    "XP awarded to the owner when the workout is completed."
    xpReward: Int!
    exercises: [Exercise!]!
    completed: Boolean!
    "ISO 8601 timestamp, or null while the workout is not completed."
    completedAt: String
    playerId: ID!
    player: Player
  }

  """A player profile with progression."""
  type Player {
    id: ID!
    username: String!
    displayName: String!
    "Only returned for the signed-in player's own profile; null for everyone else."
    email: String
    avatarUrl: String
    totalXp: Int!
    "Level is floor(totalXp / 500) + 1."
    level: Int!
    createdAt: String!
    workouts: [Workout!]!
  }

  """Result of a delete mutation."""
  type DeleteResult {
    id: ID!
    deleted: Boolean!
  }

  input ExerciseInput {
    name: String!
    sets: Int!
    reps: Int!
  }

  input WorkoutInput {
    name: String!
    type: WorkoutType!
    difficulty: Int!
    durationMinutes: Int!
    xpReward: Int!
    exercises: [ExerciseInput!]
    completed: Boolean
  }

  input PlayerInput {
    username: String!
    displayName: String!
    email: String!
    avatarUrl: String
  }

  type Query {
    "List workouts (public), newest first. Optionally filter by type, completion, or owner."
    workouts(type: WorkoutType, completed: Boolean, playerId: ID): [Workout!]!
    "Get one workout by id (public)."
    workout(id: ID!): Workout
    "List players (public), highest XP first."
    players: [Player!]!
    "Get one player by id (public)."
    player(id: ID!): Player
    "The signed-in player, or null when not signed in."
    me: Player
  }

  type Mutation {
    "Create a workout owned by the signed-in player. Requires sign-in."
    createWorkout(input: WorkoutInput!): Workout!
    "Replace a workout you own (PUT semantics: all fields are replaced). Requires sign-in."
    updateWorkout(id: ID!, input: WorkoutInput!): Workout!
    "Mark a workout you own as completed and award its XP. Requires sign-in."
    completeWorkout(id: ID!): Workout!
    "Delete a workout you own. Requires sign-in."
    deleteWorkout(id: ID!): DeleteResult!
    "Create a player profile you manage. Requires sign-in."
    createPlayer(input: PlayerInput!): Player!
    "Replace a player profile you own or created. Requires sign-in."
    updatePlayer(id: ID!, input: PlayerInput!): Player!
    "Delete a player profile you own or created, along with its workouts. Requires sign-in."
    deletePlayer(id: ID!): DeleteResult!
  }
`;
