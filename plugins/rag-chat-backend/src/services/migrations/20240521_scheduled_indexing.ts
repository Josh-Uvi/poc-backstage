import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  if (isPostgres) {
    const hasTable = await knex.schema.hasTable('rag_chat_embeddings');
    if (hasTable) {
      await knex.schema.alterTable('rag_chat_embeddings', table => {
        table.string('content_hash');
        table.dateTime('indexed_at');
        table.index(['source_id', 'content_hash']);
      });

      // Update existing rows
      await knex('rag_chat_embeddings').update({
        content_hash: knex.raw('md5(text)'),
        indexed_at: knex.fn.now(),
      });

      await knex.schema.alterTable('rag_chat_embeddings', table => {
        table.string('content_hash').notNullable().alter();
        table.dateTime('indexed_at').notNullable().alter();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  if (isPostgres) {
    const hasTable = await knex.schema.hasTable('rag_chat_embeddings');
    if (hasTable) {
      await knex.schema.alterTable('rag_chat_embeddings', table => {
        table.dropIndex(['source_id', 'content_hash']);
        table.dropColumn('content_hash');
        table.dropColumn('indexed_at');
      });
    }
  }
}
