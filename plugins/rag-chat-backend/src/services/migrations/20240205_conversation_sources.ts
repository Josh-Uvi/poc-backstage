import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('rag_chat_conversation_sources', table => {
    table.string('id').primary().notNullable();
    table
      .string('conversation_id')
      .notNullable()
      .references('id')
      .inTable('rag_chat_conversations')
      .onDelete('CASCADE');
    table.string('source_id').notNullable();
    table.string('file_name').notNullable();
    table.string('content_type').nullable();
    table.dateTime('created_at').notNullable();

    table.index(['conversation_id']);
    table.index(['source_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rag_chat_conversation_sources');
}