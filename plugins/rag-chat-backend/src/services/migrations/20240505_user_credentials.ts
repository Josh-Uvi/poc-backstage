import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('rag_chat_user_credentials', table => {
    table.string('user_ref').notNullable();
    table.string('model_id').notNullable();
    table.string('api_token').notNullable();
    table.string('api_base_url').nullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.primary(['user_ref', 'model_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('rag_chat_user_credentials');
}
