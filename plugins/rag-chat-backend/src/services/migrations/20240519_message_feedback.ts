import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rag_chat_messages', table => {
    table.string('feedback').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rag_chat_messages', table => {
    table.dropColumn('feedback');
  });
}
