<?php
/**
 * Exponha metas do Rank Math na REST API do WordPress para aceitar via /wp/v2/posts.
 * Coloque em wp-content/mu-plugins/ ou no functions.php do tema ativo.
 */

add_action('init', function () {
    $meta_keys = [
        'rank_math_title',
        'rank_math_description',
        'rank_math_focus_keyword',
        // Adicione outras se precisar, ex.: 'rank_math_canonical_url'
    ];

    foreach ($meta_keys as $key) {
        register_post_meta(
            '', // vazio = todos os post types; troque para 'post' se quiser restringir
            $key,
            [
                'show_in_rest'  => true,
                'single'        => true,
                'type'          => 'string',
                'auth_callback' => function () {
                    return current_user_can('edit_posts');
                },
            ]
        );
    }
});
