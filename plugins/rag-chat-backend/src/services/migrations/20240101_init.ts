import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('rag_chat_conversations', table => {
    table.string('id').primary().notNullable();
    table.string('user_ref').notNullable();
    table.string('title').notNullable();
    table.dateTime('created_at').notNullable();
    table.dateTime('updated_at').notNullable();
    table.index(['user_ref']);
  });

  await knex.schema.createTable('rag_chat_messages', table => {
    table.string('id').primary().notNullable();
    table
      .string('conversation_id')
      .notNullable()
      .references('id')
      .inTable('rag_chat_conversations')
      .onDelete('CASCADE');
    table.string('role').notNullable(); // 'user' | 'assistant'
    table.text('content').notNullable();
    table.dateTime('timestamp').notNullable();
    table.index(['conversation_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('rag_chat_messages');
  await knex.schema.dropTableIfExists('rag_chat_conversations');
}
