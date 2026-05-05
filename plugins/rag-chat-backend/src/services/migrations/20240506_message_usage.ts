import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rag_chat_messages', table => {
    table.integer('usage_prompt_tokens').nullable();
    table.integer('usage_completion_tokens').nullable();
    table.integer('usage_total_tokens').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rag_chat_messages', table => {
    table.dropColumn('usage_prompt_tokens');
    table.dropColumn('usage_completion_tokens');
    table.dropColumn('usage_total_tokens');
  });
}
