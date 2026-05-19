import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  if (isPostgres) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS vector;');

    await knex.schema.createTable('rag_chat_embeddings', table => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('source_id').notNullable();
      table.text('text').notNullable();
      table.jsonb('metadata').notNullable();
      
      // Add the vector column
      table.specificType('embedding', 'vector(1536)').notNullable();

      table.index(['source_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  if (isPostgres) {
    await knex.schema.dropTableIfExists('rag_chat_embeddings');
    // We do not drop the extension just in case other plugins or tables rely on it.
  }
}
